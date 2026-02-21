import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import User from '#models/user'
import UserRole from '#models/user_role'
import logger from '@adonisjs/core/services/logger'
import type { RoleName } from '#models/user_role'

const VALID_ROLES: RoleName[] = ['viewer', 'team_member', 'stream_lead', 'platform_admin']

export default class UsersController {
  async index({ view }: HttpContext) {
    const users = await User.query().preload('roles').orderBy('email')
    return view.render('admin/users/index', { users })
  }

  async show({ params, view }: HttpContext) {
    const user = await User.query().where('id', params.id).preload('roles').firstOrFail()
    return view.render('admin/users/show', { user, validRoles: VALID_ROLES })
  }

  async activate({ params, response, session }: HttpContext) {
    const user = await User.findOrFail(params.id)
    user.isActive = true
    await user.save()
    session.flash('success', 'User activated')
    return response.redirect(`/admin/users/${user.id}`)
  }

  async deactivate({ params, response, session }: HttpContext) {
    const user = await User.findOrFail(params.id)
    user.isActive = false
    await user.save()
    session.flash('success', 'User deactivated')
    return response.redirect(`/admin/users/${user.id}`)
  }

  async addRole({ params, request, response, session, auth }: HttpContext) {
    const user = await User.findOrFail(params.id)
    const role = request.input('role') as RoleName

    if (!VALID_ROLES.includes(role)) {
      session.flash('errors', { role: 'Invalid role' })
      return response.redirect(`/admin/users/${user.id}`)
    }

    try {
      await UserRole.create({
        userId: user.id,
        role,
        grantedAt: DateTime.now(),
        grantedBy: auth.user!.id,
      })
      session.flash('success', `Role "${role}" added`)
    } catch (error) {
      logger.error({ err: error, controller: 'UsersController' }, 'Failed to add role')
      session.flash('errors', { role: 'Failed to add role' })
    }

    return response.redirect(`/admin/users/${user.id}`)
  }

  async removeRole({ params, response, session }: HttpContext) {
    const role = await UserRole.query()
      .where('id', params.roleId)
      .where('user_id', params.id)
      .first()

    if (!role) {
      session.flash('errors', { role: 'Role not found' })
      return response.redirect(`/admin/users/${params.id}`)
    }

    // Only allow removing manually-granted roles (grantedBy IS NOT NULL)
    if (role.grantedBy === null) {
      session.flash('errors', { role: 'Cannot remove OIDC-granted roles' })
      return response.redirect(`/admin/users/${params.id}`)
    }

    await role.delete()
    session.flash('success', 'Role removed')
    return response.redirect(`/admin/users/${params.id}`)
  }
}
