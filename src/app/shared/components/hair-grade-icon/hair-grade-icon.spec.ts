import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { HairGradeIcon } from './hair-grade-icon';

describe('HairGradeIcon', () => {
  let component: HairGradeIcon;
  let fixture: ComponentFixture<HairGradeIcon>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HairGradeIcon],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(HairGradeIcon);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('grade', '');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
