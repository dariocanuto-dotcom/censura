import btsSamplesRouter from './bts-samples';
import operationsRouter from './operations';
import { systemMetrics } from '../lib/system-monitor';
import recordingsRouter from "./recordings";
import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usuariosRouter from "./usuarios";
import conteudosRouter from "./conteudos";
import descritoresRouter from "./descritores";
import solicitacoesRouter from "./solicitacoes";
import classificacoesRouter from "./classificacoes";
import dashboardRouter from "./dashboard";
import notificacoesRouter from "./notificacoes";
import dispositivosRouter from "./dispositivos";
import srtRouter from "./srt";
import aribRouter from "./arib";

const router: IRouter = Router();

router.use(healthRouter);
router.use('/bts-samples',btsSamplesRouter);
router.use('/operations',operationsRouter);
router.get('/system/metrics',async(_req,res)=>{try{res.setHeader('Cache-Control','no-store');res.json(await systemMetrics());}catch{res.status(503).json({error:'Monitoramento indisponível.'});}});
router.use("/recordings", recordingsRouter);
router.use("/usuarios", usuariosRouter);
router.use("/conteudos", conteudosRouter);
router.use("/descritores", descritoresRouter);
router.use("/solicitacoes", solicitacoesRouter);
router.use("/classificacoes", classificacoesRouter);
router.use("/dashboard", dashboardRouter);
router.use("/notificacoes", notificacoesRouter);
router.use("/dispositivos", dispositivosRouter);
router.use("/srt", srtRouter);
router.use("/arib", aribRouter);

export default router;
