import type { Actor } from '../../actor.js';
import { authorize } from '../../authorization.js';
import type { InstanceAdmins } from '../../instance-email-ports.js';

/**
 * Who may change an instance-wide setting (email, AI): a signed-in person (never an API key or an agent alone) with the
 * organization permission to manage email, who is the first owner of the instance or an INSTANCE_ADMIN_EMAILS address.
 */
export async function mayManageInstance(admins: InstanceAdmins, actor: Actor): Promise<boolean> {
  if (actor.type !== 'user') return false;
  try {
    authorize(actor, 'email_settings:manage');
  } catch {
    return false;
  }
  return admins.isInstanceAdmin(actor.id);
}
