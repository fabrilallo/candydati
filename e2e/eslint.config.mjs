import root from '../eslint.config.mjs';

export default [...root, { ignores: ['.results/**', '.report/**'] }];
