import { Injectable } from '@nestjs/common';

/** A rule a business module adds for who may read a file it owns (e.g. a progress photo of a client). */
export interface FileReadPolicy {
  /** Called inside an organization request, for a READY file of that organization. */
  canRead(fileId: string): Promise<boolean>;
}

/**
 * Capabilities must not know business modules, so modules register their read rules here. A file is readable by
 * its uploader, by people who can see a task it is attached to, or when any registered policy allows it.
 */
@Injectable()
export class FileAccessRegistry {
  private readonly policies: FileReadPolicy[] = [];

  register(policy: FileReadPolicy): void {
    this.policies.push(policy);
  }

  async canRead(fileId: string): Promise<boolean> {
    for (const p of this.policies) if (await p.canRead(fileId)) return true;
    return false;
  }
}
