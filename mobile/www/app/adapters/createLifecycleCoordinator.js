// Única borda desta etapa que importa @capacitor/app. LifecycleCoordinator.js
// em si nunca importa Capacitor — recebe `appState` como dependência (ver seu
// construtor), o que o torna testável em Node puro com fakes. Espelha o
// padrão já usado em createCapacitorStorage.js/createCapacitorMedia.js.
//
// Não cria nenhum serviço em background Android: App.addListener apenas
// observa mudanças de estado enquanto o processo do app está vivo.

import { App } from '@capacitor/app';
import { LifecycleCoordinator } from './LifecycleCoordinator.js';

/**
 * Constrói um LifecycleCoordinator real, observando o plugin @capacitor/app.
 * @param {{controller: import('../AppController.js').AppController, platform?: import('./PresentationPlatform.js').PresentationPlatform, now?: () => number, logger?: {warn:(payload:object)=>void}}} options
 * @returns {LifecycleCoordinator}
 */
export function createLifecycleCoordinator({ controller, platform, now, logger } = {}) {
  return new LifecycleCoordinator({
    controller,
    platform,
    now,
    logger,
    appState: {
      addListener: (eventName, cb) => App.addListener(eventName, cb),
    },
  });
}
