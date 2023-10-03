const postcss = require('rollup-plugin-postcss');
const autoprefixer = require('autoprefixer');
const cssnano = require('cssnano');
const image = require('@rollup/plugin-image');

module.exports = {
  /**
   * @param {import('rollup/dist/rollup').InputOptions} config
   */
  rollup(config, options) {
    config.plugins.push(
      postcss({
        modules: true,
        plugins: [
          autoprefixer(),
          cssnano({
            preset: 'default',
          }),
        ],
        // inject: false,
        // only write out CSS for the first bundle (avoids pointless extra files):
        // extract: !!options.writeMeta,
      })
    );
    config.plugins.unshift(image());
    return config;
  },
};
