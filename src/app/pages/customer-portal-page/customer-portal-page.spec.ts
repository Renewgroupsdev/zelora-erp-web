import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CustomerPortalPage } from './customer-portal-page';

describe('CustomerPortalPage', () => {
  let component: CustomerPortalPage;
  let fixture: ComponentFixture<CustomerPortalPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomerPortalPage]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CustomerPortalPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
