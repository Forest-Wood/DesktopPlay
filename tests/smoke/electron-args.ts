// Optional workaround for local GPU stalls; normal application and CI launches stay unchanged.
export const electronArgs = process.env.DESKTOPPLAY_TEST_SOFTWARE_RENDERING === '1' ? ['--disable-gpu', '.'] : ['.'];
