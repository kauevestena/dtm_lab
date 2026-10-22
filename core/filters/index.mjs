// Ground filters, in the order of the deck's "seven families" slide.
import * as slope from './slope.mjs';
import * as pmf from './pmf.mjs';
import * as smrf from './smrf.mjs';
import * as ptd from './ptd.mjs';
import * as robust from './robust.mjs';
import * as csf from './csf.mjs';
import * as mcc from './mcc.mjs';
import * as blockmin from './blockmin.mjs';

export const FILTERS = [slope, pmf, smrf, ptd, robust, csf, mcc, blockmin];
export const byId = Object.fromEntries(FILTERS.map((f) => [f.id, f]));
