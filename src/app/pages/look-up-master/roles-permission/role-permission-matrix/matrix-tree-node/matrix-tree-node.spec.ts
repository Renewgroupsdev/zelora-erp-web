import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { MatrixTreeNode } from './matrix-tree-node';

describe('MatrixTreeNode', () => {
  let component: MatrixTreeNode;
  let fixture: ComponentFixture<MatrixTreeNode>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MatrixTreeNode],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(MatrixTreeNode);
    component = fixture.componentInstance;
    // Rendered by its opener with real data (dialog data / inputs), so only creation is checked here.
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
