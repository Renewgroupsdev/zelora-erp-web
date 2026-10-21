import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Consultations } from './consultations';

describe('Consultations', () => {
  let component: Consultations;
  let fixture: ComponentFixture<Consultations>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Consultations]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Consultations);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
