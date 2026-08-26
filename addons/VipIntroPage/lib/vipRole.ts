export const VIP_ROLE = 'vip';

export function isVipUser(user: { _id?: number; role?: string; roles?: string[] } | null | undefined): boolean {
    if (!user || Number(user._id) <= 1) return false;
    const role = String(user.role || '').toLowerCase();
    if (role === VIP_ROLE) return true;
    const roles = user.roles;
    return Array.isArray(roles) && roles.some((r) => String(r).toLowerCase() === VIP_ROLE);
}
