import { randomBytes } from 'node:crypto'
import { DateTime } from 'luxon'
import UserSession from '#models/user_session'

const SESSION_DURATION_HOURS = 8

export default class UserSessionService {
  /**
   * Create a new platform session record and return the token.
   */
  async create(userId: number, authMethod: 'oidc' | 'database'): Promise<string> {
    const platformToken = randomBytes(32).toString('hex')

    await UserSession.create({
      userId,
      authMethod,
      platformToken,
      expiresAt: DateTime.now().plus({ hours: SESSION_DURATION_HOURS }),
      isRevoked: false,
    })

    return platformToken
  }

  /**
   * Look up an active (non-revoked, non-expired) session by its token.
   * Updates last_activity_at as a side-effect.
   */
  async findActive(platformToken: string): Promise<UserSession | null> {
    const session = await UserSession.query()
      .where('platform_token', platformToken)
      .where('is_revoked', false)
      .where('expires_at', '>', DateTime.now().toSQL()!)
      .first()

    if (session) {
      session.lastActivityAt = DateTime.now()
      await session.save()
    }

    return session
  }

  /**
   * Revoke a session by its token (called on logout).
   */
  async revokeByToken(platformToken: string): Promise<void> {
    await UserSession.query()
      .where('platform_token', platformToken)
      .update({ is_revoked: true })
  }

  /**
   * Revoke a session by its database ID (called from admin UI).
   */
  async revokeById(id: number): Promise<UserSession> {
    const session = await UserSession.findOrFail(id)
    session.isRevoked = true
    await session.save()
    return session
  }

  /**
   * Revoke all active sessions for a user (e.g., on logout when token not in session).
   */
  async revokeAllForUser(userId: number): Promise<void> {
    await UserSession.query()
      .where('user_id', userId)
      .where('is_revoked', false)
      .update({ is_revoked: true })
  }

  /**
   * List all sessions for the admin view, most recent first.
   */
  async listAll(limit = 100): Promise<UserSession[]> {
    return UserSession.query().preload('user').orderBy('created_at', 'desc').limit(limit)
  }
}
