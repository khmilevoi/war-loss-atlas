import { reatomComponent } from '@reatom/react';
import { layoutRoute } from '../app/routes';

export const App = reatomComponent(() => layoutRoute.render(), 'AtlasApp');
