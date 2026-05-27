// htm template tag bound to React.createElement.
import { createElement } from 'react';
import htm from 'htm';
export const html = htm.bind(createElement);
