import { DateTime } from 'luxon'
import OidcGroupMapping from '#models/oidc_group_mapping'
import User from '#models/user'
import UserRole from '#models/user_role'
import type { RoleName } from '#models/user_role'

export interface RoleAssignment {
  role: RoleName
  deliveryStreamId: number | null
  techStreamId: number | null
}

export default class OidcGroupMappingService {
  /**
   * Fetch all mappings for a given provider.
   */
  async getMappingsForProvider(provider: string): Promise<OidcGroupMapping[]> {
    return OidcGroupMapping.query().where('provider', provider)
  }

  /**
   * Given a list of OIDC groups and a list of mappings, return the role assignments
   * that apply.
   */
  matchGroups(groups: string[], mappings: OidcGroupMapping[]): RoleAssignment[] {
    const results: RoleAssignment[] = []

    for (const mapping of mappings) {
      let matched = false

      if (mapping.isRegex) {
        const re = new RegExp(mapping.groupPattern)
        matched = groups.some((g) => re.test(g))
      } else {
        matched = groups.includes(mapping.groupPattern)
      }

      if (matched) {
        results.push({
          role: mapping.role,
          deliveryStreamId: mapping.deliveryStreamId,
          techStreamId: mapping.techStreamId,
        })
      }
    }

    return results
  }

  /**
   * Delete all OIDC-granted roles for this user (grantedBy = null) then
   * insert new roles based on matched group mappings.
   */
  async applyMappings(userId: number, groups: string[], provider: string): Promise<void> {
    const mappings = await this.getMappingsForProvider(provider)
    const assignments = this.matchGroups(groups, mappings)

    // Delete existing OIDC-granted roles (grantedBy = null)
    await UserRole.query().where('user_id', userId).whereNull('granted_by').delete()

    // Insert new roles
    for (const assignment of assignments) {
      await UserRole.create({
        userId,
        role: assignment.role,
        deliveryStreamId: assignment.deliveryStreamId,
        techStreamId: assignment.techStreamId,
        grantedBy: null,
        grantedAt: DateTime.now(),
      })
    }
  }

  /**
   * Find an existing user by email or create a new one.
   * New users created via OIDC are active with no password.
   */
  async findOrCreateUser(email: string, displayName: string): Promise<User> {
    const existing = await User.findBy('email', email)
    if (existing) return existing

    return User.create({
      email,
      fullName: displayName,
      // Random placeholder — OIDC users never use password auth
      password: `oidc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      isActive: true,
    })
  }
}
