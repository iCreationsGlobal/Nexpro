module.exports = function (api) {
  const isTest = api.env('test');
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['.'],
          alias: { '@': './' },
        },
      ],
      !isTest && 'react-native-reanimated/plugin',
    ].filter(Boolean),
  };
};
