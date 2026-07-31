import { piapiVideoService } from '../services/piapi-video-service.js';
const svc = piapiVideoService as any;
async function run() {
  console.log('Polling bypass task 6002f1d8-a4bc-4594-9c2a-bbe685259aad...');
  const result = await svc.pollForCompletion('6002f1d8-a4bc-4594-9c2a-bbe685259aad', 'seedance-2.0');
  console.log('Status:', result.success ? 'SUCCESS' : 'FAILED');
  if (result.success) {
    console.log('URL:', result.s3Url || result.videoUrl);
  } else {
    console.log('Error:', result.error);
  }
}
run().catch(console.error);
