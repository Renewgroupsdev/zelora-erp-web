import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { ModuleTreeNode } from './module-tree-node';

describe('ModuleTreeNode', () => {
  let component: ModuleTreeNode;
  let fixture: ComponentFixture<ModuleTreeNode>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModuleTreeNode],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ModuleTreeNode);
    component = fixture.componentInstance;
    // Rendered by its opener with real data (dialog data / inputs), so only creation is checked here.
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
