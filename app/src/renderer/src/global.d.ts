import type { HoermondBridge } from '@shared/ipc-contract';
declare global {
  interface Window {
    hoermond: HoermondBridge;
  }
}
export {};
