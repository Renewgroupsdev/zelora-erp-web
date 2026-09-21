import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ServiceCategory } from './service-category';

describe('ServiceCategory', () => {
  let component: ServiceCategory;
  let fixture: ComponentFixture<ServiceCategory>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ServiceCategory]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ServiceCategory);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
