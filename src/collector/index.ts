import { startCollector, stopCollector } from './collector';

(async () => {
  try {
    await startCollector();
  } catch (err) {
    console.error('Collector failed to start', err);
    process.exit(1);
  }
})();

process.on('SIGINT', () => {
  console.log('SIGINT received, stopping collector...');
  stopCollector();
  process.exit(0);
});
