import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'app-preloader',
  imports: [],
  templateUrl: './preloader.html',
  styleUrl: './preloader.scss',
})
export class Preloader implements OnInit{

  @Input() display: boolean = false;

  constructor() { }

  ngOnInit(): void {
  }

}
