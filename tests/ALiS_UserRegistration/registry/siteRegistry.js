import { sites } from '../config/sites.js';
import { resolveEnvironment, resolveLoginUrl } from '../config/urls.js';
import { ConvStrategy } from '../strategies/ConvStrategy.js';
import { CranesStrategy } from '../strategies/CranesStrategy.js';
import { DpbhStrategy } from '../strategies/DpbhStrategy.js';
import { NjStrategy } from '../strategies/NjStrategy.js';
import { NvrcpStrategy } from '../strategies/NvrcpStrategy.js';
import { SaptaStrategy } from '../strategies/SaptaStrategy.js';
import { TxocaStrategy } from '../strategies/TxocaStrategy.js';

const strategyMap = {
  CONV: ConvStrategy,
  CRANES: CranesStrategy,
  DPBH: DpbhStrategy,
  NJ: NjStrategy,
  NVRCP: NvrcpStrategy,
  SAPTA: SaptaStrategy,
  TXOCA: TxocaStrategy,
};

export const siteRegistry = {
  allSites() {
    return Object.values(sites);
  },

  get(siteKey) {
    const site = sites[String(siteKey).toUpperCase()];
    if (!site) throw new Error(`Unknown site key "${siteKey}".`);
    return site;
  },

  products(siteKey) {
    return this.get(siteKey).products;
  },

  resolve(siteKey, environmentKey) {
    const site = this.get(siteKey);
    const environment = resolveEnvironment(environmentKey);
    const loginUrl = resolveLoginUrl(environment.key, site.key);

    if (!loginUrl) return null;

    return {
      ...site,
      loginUrl,
      environment,
    };
  },

  createStrategy(siteOrKey, context) {
    const site = typeof siteOrKey === 'string'
      ? this.resolve(siteOrKey, context.environmentKey)
      : siteOrKey;

    if (!site) {
      throw new Error(`Site "${siteOrKey}" is not configured for environment "${context.environmentKey}".`);
    }

    const Strategy = strategyMap[site.strategy];
    if (!Strategy) throw new Error(`No strategy registered for "${site.strategy}".`);
    return new Strategy({ site, ...context });
  },
};
