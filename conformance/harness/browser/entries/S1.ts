// S1: native `globalThis.Temporal`. This bundle contains no polyfill.
import { native } from '../capture-native.js';
import { nativeSource } from '../../../source.js';
import { exposeHarness } from '../page.js';

exposeHarness(() => nativeSource(native));
