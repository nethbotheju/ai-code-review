/** Shared constants for the pi engine. */

/** npm package name, used to install pi on the runner at runtime. */
export const PI_PACKAGE = '@earendil-works/pi-coding-agent';

/** Provider id registered in models.json for openai-compatible endpoints. */
export const PI_CUSTOM_PROVIDER = 'custom';

/** Env var referenced by models.json ($ interpolation) for the compatible key. */
export const PI_CUSTOM_API_KEY_ENV = 'CUSTOM_API_KEY';
