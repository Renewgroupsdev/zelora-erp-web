import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Followups } from './followups';

describe('Followups', () => {
  let component: Followups;
  let fixture: ComponentFixture<Followups>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Followups]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Followups);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
