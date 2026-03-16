module.exports = {
  apps: [
    {
      name: "Search",
      // 1. Usamos la ruta absoluta al binario de Next
      script: "C:/inetpub/wwwroot/Search/node_modules/next/dist/bin/next",
      // 2. Establecemos el directorio de trabajo explícitamente
      cwd: "C:/inetpub/wwwroot/Search",
      args: "start",
      instances: "max",
      exec_mode: "cluster",
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3000
      }
    }
  ]
}