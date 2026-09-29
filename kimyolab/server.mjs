// KimyoLab production/static server entry point.
// Serves ONLY the built deployment surface (default ./dist, override with KIMYOLAB_PUBLIC_ROOT).
import {createKimyoLabServer} from './server/app.mjs';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4173);

let server;
try {
  server = createKimyoLabServer();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
server.listen(port, host, () => {
  const address = server.address();
  console.log(`KimyoLab v20 Sinco: http://${host}:${typeof address === "object" && address ? address.port : port}`);
});
