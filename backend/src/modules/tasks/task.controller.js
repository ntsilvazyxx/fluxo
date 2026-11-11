import { requireIdempotencyKey } from '../../shared/http/idempotency.js';

const sendMutation = async (response, promise) => {
  const result = await promise;
  if (result?.body !== undefined) response.status(result.status).set('idempotency-replayed', String(result.replayed)).json({ data: { task: result.body } });
  else response.json({ data: { task: result } });
};
export const createTaskController = ({ service }) => ({
  list: async (req,res)=>{const result=await service.list(req.auth,req.validated.query,'all');res.json({data:{tasks:result.tasks},meta:result.meta});},
  kanban: async (req,res)=>{const result=await service.list(req.auth,req.validated.query,'kanban');res.json({data:{tasks:result.tasks},meta:result.meta});},
  history: async (req,res)=>{const result=await service.list(req.auth,req.validated.query,'history');res.json({data:{tasks:result.tasks},meta:result.meta});},
  mine: async (req,res)=>{const result=await service.list(req.auth,req.validated.query,'mine');res.json({data:{tasks:result.tasks},meta:result.meta});},
  detail: async (req,res)=>res.json({data:{task:await service.detail(req.auth,req.validated.params.id)}}),
  create: async (req,res)=>sendMutation(res,service.create(req,req.validated.body,requireIdempotencyKey(req))),
  update: async (req,res)=>sendMutation(res,service.update(req,req.validated.params.id,req.validated.body)),
  assign: async (req,res)=>sendMutation(res,service.assign(req,req.validated.params.id,req.validated.body,requireIdempotencyKey(req))),
  accept: async (req,res)=>sendMutation(res,service.accept(req,req.validated.params.id,req.validated.body,requireIdempotencyKey(req))),
  reject: async (req,res)=>sendMutation(res,service.reject(req,req.validated.params.id,req.validated.body,requireIdempotencyKey(req))),
  complete: async (req,res)=>sendMutation(res,service.complete(req,req.validated.params.id,req.validated.body,requireIdempotencyKey(req))),
  cancel: async (req,res)=>sendMutation(res,service.cancel(req,req.validated.params.id,req.validated.body,requireIdempotencyKey(req))),
});
