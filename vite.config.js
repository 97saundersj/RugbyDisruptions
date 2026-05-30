import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vuetify, { transformAssetUrls } from "vite-plugin-vuetify";

export default defineConfig({
  base: process.env.VITE_BASE_URL || "/",
  plugins: [vue({ template: { transformAssetUrls } }), vuetify()],
});
