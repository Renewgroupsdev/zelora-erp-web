import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { GoodsInward } from './goods-inward';

describe('GoodsInward', () => {
  let component: GoodsInward;
  let fixture: ComponentFixture<GoodsInward>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GoodsInward],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(GoodsInward);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
