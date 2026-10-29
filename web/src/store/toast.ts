import { create } from "zustand";

/** A short confirmation of the last canvas action ("Rotated 90°", "Undo"). */
interface ToastState {
  id: number;
  msg: string | null;
  toast: (msg: string) => void;
}

export const useToast = create<ToastState>((set) => ({
  id: 0,
  msg: null,
  toast: (msg) => set((s) => ({ id: s.id + 1, msg })),
}));

export const toast = (msg: string) => useToast.getState().toast(msg);
