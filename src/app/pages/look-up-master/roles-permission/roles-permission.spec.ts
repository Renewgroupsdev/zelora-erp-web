import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RolesPermission } from './roles-permission';

describe('RolesPermission', () => {
  let component: RolesPermission;
  let fixture: ComponentFixture<RolesPermission>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RolesPermission]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RolesPermission);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
