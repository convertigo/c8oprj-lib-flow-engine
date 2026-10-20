const _flow = { accessibility:"private", description:"Three simulated asynchronous-job attempts, with sleeping intervals and explicit bounds." }
function sample_AsyncJobPoll({result}) {
 local.attempts = 0
 local.poll = flow.poll({until:local.attempts >= 3,intervalMs:10,timeoutMs:2000,maxAttempts:5,$$nodes:function(){
  local.attempts = local.attempts + 1
 }})
 result.attempts = local.attempts
 result.completed = local.poll.completed
}
