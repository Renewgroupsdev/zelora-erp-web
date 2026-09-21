import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Source } from './source';

describe('Source', () => {
  let component: Source;
  let fixture: ComponentFixture<Source>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Source]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Source);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
