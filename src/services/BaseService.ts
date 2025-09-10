export default abstract class BaseService {
  name: string;
  constructor(name: string) {
    this.name = name;
  }

  // optional lifecycle hook for services
  async init(): Promise<void> {
    // noop by default
  }

  // optional shutdown
  async shutdown(): Promise<void> {
    // noop by default
  }
}
