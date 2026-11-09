import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error.js';
import { DesignService } from '../../infra/platform-config/design.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { FeaturesService } from '../rbac/features.service.js';

/**
 * A person's own design: chosen among the designs an administrator made available. The choice is ignored (never an
 * error) when its design stops being available or the platform switched personal choice off; an organization can switch
 * it off for its members too (clients read that from the organization context).
 */
@Injectable()
export class MeDesignService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DesignService) private readonly designs: DesignService,
    @Inject(FeaturesService) private readonly features: FeaturesService,
  ) {}

  /** What this person sees as their own design right now: the theme itself, or null (they follow the organization or platform design). */
  async current(userId: string) {
    const enabled = await this.features.isEnabled('user_design_choice');
    const row = await this.prisma.user.findUnique({ where: { id: userId }, select: { designKey: true } });
    const stored = enabled && row?.designKey ? (await this.designs.themes()).get(row.designKey) : undefined;
    const active = stored?.userSelectable ? stored : undefined;
    return { enabled, selectedKey: active ? active.theme.key : null, design: active ? active.theme : null };
  }

  async options(userId: string) {
    const state = await this.current(userId);
    const themes = state.enabled ? [...(await this.designs.themes()).values()].filter((s) => s.userSelectable).map((s) => ({ ...s.theme, builtIn: s.builtInKey !== null })) : [];
    return { ...state, designs: themes, platformDefaultKey: await this.designs.defaultKey() };
  }

  async choose(userId: string, key: string | null) {
    await this.features.require('user_design_choice');
    if (key !== null) {
      const s = (await this.designs.themes()).get(key);
      if (!s || !s.userSelectable) throw new AppError('NOT_FOUND');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { designKey: key } });
    return this.current(userId);
  }
}
