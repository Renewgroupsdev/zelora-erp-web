import { Injectable, signal } from '@angular/core';

/**
 * In-page tab strips (purchase, HR, accounts...) register the pages they switch between here,
 * so the sidebar can keep its single module entry active on every one of those pages.
 */
@Injectable({ providedIn: 'root' })
export class NavTabGroupService {
  private readonly _groups = signal<string[][]>([]);
  readonly groups = this._groups.asReadonly();

  /** Returns a function that removes this group again. */
  register(paths: string[]): () => void {
    this._groups.update(groups => [...groups, paths]);
    return () => this._groups.update(groups => groups.filter(group => group !== paths));
  }
}
