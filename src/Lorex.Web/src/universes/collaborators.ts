import { apiFetch } from '../lib/api'
import type { UniverseRoleValue } from './types'

/** An accepted collaborator, as the owner manages them. No email: the username is who they are here. */
export interface Collaborator {
  userId: string
  username: string
  role: UniverseRoleValue
  joinedAt: string
}

/** A pending invitation, as its owner sees it. */
export interface PendingInvitation {
  id: string
  email: string
  role: UniverseRoleValue
  createdAt: string
  expiresAt: string
}

export interface Collaborators {
  members: Collaborator[]
  invitations: PendingInvitation[]
}

/** An invitation addressed to the signed-in account. */
export interface ReceivedInvitation {
  id: string
  universeId: string
  universeName: string
  role: UniverseRoleValue
  expiresAt: string
}

export interface AcceptedInvitation {
  universeId: string
  role: UniverseRoleValue
}

/** The 409 an address with a live invitation gets: the invitation is named, not duplicated. */
export const INVITATION_PENDING = 'invitation_pending'
export const INVITATION_NOT_FOUND = 'invitation_not_found'
export const INVITATION_OTHER_ACCOUNT = 'invitation_other_account'
export const INVITATION_EXPIRED = 'invitation_expired'

const universe = (universeId: string) => `/api/universes/${universeId}`

export function getCollaborators(universeId: string, signal?: AbortSignal) {
  return apiFetch<Collaborators>(`${universe(universeId)}/collaborators`, { signal })
}

export function inviteCollaborator(universeId: string, email: string, role: UniverseRoleValue) {
  return apiFetch<PendingInvitation>(`${universe(universeId)}/invitations`, {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  })
}

export function changeInvitationRole(
  universeId: string,
  invitationId: string,
  role: UniverseRoleValue,
) {
  return apiFetch<PendingInvitation>(`${universe(universeId)}/invitations/${invitationId}`, {
    method: 'PUT',
    body: JSON.stringify({ role }),
  })
}

export function revokeInvitation(universeId: string, invitationId: string) {
  return apiFetch<void>(`${universe(universeId)}/invitations/${invitationId}`, { method: 'DELETE' })
}

export function changeCollaboratorRole(
  universeId: string,
  userId: string,
  role: UniverseRoleValue,
) {
  return apiFetch<Collaborator>(
    `${universe(universeId)}/collaborators/${encodeURIComponent(userId)}`,
    { method: 'PUT', body: JSON.stringify({ role }) },
  )
}

export function removeCollaborator(universeId: string, userId: string) {
  return apiFetch<void>(`${universe(universeId)}/collaborators/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  })
}

export function listMyInvitations(signal?: AbortSignal) {
  return apiFetch<ReceivedInvitation[]>('/api/invitations', { signal })
}

export function getMyInvitation(invitationId: string, signal?: AbortSignal) {
  return apiFetch<ReceivedInvitation>(`/api/invitations/${invitationId}`, { signal })
}

export function acceptInvitation(invitationId: string) {
  return apiFetch<AcceptedInvitation>(`/api/invitations/${invitationId}/accept`, { method: 'POST' })
}

export function declineInvitation(invitationId: string) {
  return apiFetch<void>(`/api/invitations/${invitationId}/decline`, { method: 'POST' })
}

/** The link an owner sends by hand. Built from this page's own origin: no hostname is written into Lorex. */
export function invitationLink(invitationId: string) {
  return `${window.location.origin}/invite/${invitationId}`
}
