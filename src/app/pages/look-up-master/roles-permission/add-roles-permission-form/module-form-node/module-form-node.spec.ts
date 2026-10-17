import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { ModuleFormNode } from './module-form-node';

describe('ModuleFormNode', () => {
  let component: ModuleFormNode;
  let fixture: ComponentFixture<ModuleFormNode>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModuleFormNode],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ModuleFormNode);
    component = fixture.componentInstance;
    // Rendered by its opener with real data (dialog data / inputs), so only creation is checked here.
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
