// Interpolators, in the order of the deck's interpolation slides.
import * as tin from './tin.mjs';
import * as idw from './idw.mjs';
import * as nn from './nn.mjs';
import * as kriging from './kriging.mjs';
import * as tps from './tps.mjs';

export const INTERPOLATORS = [tin, idw, nn, kriging, tps];
export const byId = Object.fromEntries(INTERPOLATORS.map((m) => [m.id, m]));
