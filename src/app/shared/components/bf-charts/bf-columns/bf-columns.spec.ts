import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { BfColumns } from './bf-columns';

describe('BfColumns', () => {
  let component: BfColumns;
  let fixture: ComponentFixture<BfColumns>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BfColumns],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(BfColumns);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
