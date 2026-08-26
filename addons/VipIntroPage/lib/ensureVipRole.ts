import { BUILTIN_ROLES, Context, DomainModel } from 'hydrooj';
import { VIP_ROLE } from './vipRole';

async function permFromDefault(ddoc: { roles?: Record<string, string> } | null | undefined): Promise<bigint> {
    const fromDefault = ddoc?.roles?.default;
    if (fromDefault != null) return BigInt(fromDefault);
    return (BUILTIN_ROLES as { default: bigint }).default;
}

export async function ensureVipRole() {
    const domains = await DomainModel.getMulti().toArray();
    for (const ddoc of domains) {
        if (!ddoc?._id) continue;
        if (ddoc.roles?.[VIP_ROLE] != null) continue;
        await DomainModel.addRole(ddoc._id, VIP_ROLE, await permFromDefault(ddoc));
    }
}

export function bindVipRoleOnDomainCreate(ctx: Context) {
    ctx.on('domain/create', async (ddoc: { roles?: Record<string, string> }) => {
        if (ddoc.roles?.[VIP_ROLE] != null) return;
        const perm = await permFromDefault(ddoc);
        ddoc.roles = { ...(ddoc.roles || {}), [VIP_ROLE]: perm.toString() };
    });
}
