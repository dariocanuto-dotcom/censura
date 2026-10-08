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
