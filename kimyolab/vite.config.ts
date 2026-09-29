export default {
  publicDir:'public',
  server:{host:'127.0.0.1',port:4173},
  preview:{host:'127.0.0.1',port:4173},
  build:{
    outDir:'dist',
    emptyOutDir:true,
    rollupOptions:{input:'index.html'},
  },
};
