import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { resolve } from 'node:path';

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use('/api/recordings/report',express.json({limit:'8mb'}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
if(process.env.WEB_ROOT){const webRoot=resolve(process.env.WEB_ROOT);app.use(express.static(webRoot));app.get(/^(?!\/api(?:\/|$)).*/,(_req,res)=>res.sendFile(resolve(webRoot,'index.html')));}

export default app;
