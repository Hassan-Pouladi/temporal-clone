// S2: `temporal-polyfill` root export. `capture-native` must stay the first import.
import { native } from '../capture-native.js';
import { Temporal } from 'temporal-polyfill';
import { polyfillSource } from '../../../source.js';
import { exposeHarness } from '../page.js';

exposeHarness(() => polyfillSource('S2', Temporal, __TEMPORAL_POLYFILL_VERSION__, native));
