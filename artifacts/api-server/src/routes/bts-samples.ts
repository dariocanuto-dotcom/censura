import {Router} from 'express';
import {initBtsSamples,btsSamplesStatus,configureBtsSamples} from '../lib/bts-samples.ts';
const router=Router();
router.use(async(_req,_res,next)=>{try{await initBtsSamples();next();}catch(e){next(e);}});
router.get('/',(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json(btsSamplesStatus());});
router.put('/',async(req,res)=>{try{res.json(await configureBtsSamples(req.body));}catch(e){res.status(400).json({error:e instanceof Error?e.message:'Falha ao configurar amostras BTS.'});}});
export default router;
