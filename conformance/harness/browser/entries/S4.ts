// S4: `@js-temporal/polyfill`, always the polyfill.
import { native } from '../capture-native.js';
import { Temporal } from '@js-temporal/polyfill';
import { polyfillSource } from '../../../source.js';
import { exposeHarness } from '../page.js';

exposeHarness(() => polyfillSource('S4', Temporal, __JS_TEMPORAL_POLYFILL_VERSION__, native));
