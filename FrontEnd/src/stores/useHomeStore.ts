import { create } from "zustand";

interface HomeState {
  activeCategoryId: string | null;
  searchKeyword: string;
  setActiveCategoryId: (activeCategoryId: string) => void;
  clearActiveCategory: () => void;
  setSearchKeyword: (searchKeyword: string) => void;
}

export const useHomeStore = create<HomeState>((set) => ({
  activeCategoryId: null,
  searchKeyword: "",
  setActiveCategoryId: (activeCategoryId) => set({ activeCategoryId }),
  clearActiveCategory: () => set({ activeCategoryId: null }),
  setSearchKeyword: (searchKeyword) => set({ searchKeyword }),
}));
