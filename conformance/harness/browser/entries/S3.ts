// S3: `temporal-polyfill/implementation`, always the polyfill.
import { native } from '../capture-native.js';
import { Temporal } from 'temporal-polyfill/implementation';
import { polyfillSource } from '../../../source.js';
import { exposeHarness } from '../page.js';

exposeHarness(() => polyfillSource('S3', Temporal, __TEMPORAL_POLYFILL_VERSION__, native));
