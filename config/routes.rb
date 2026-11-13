resources :projects do
  resource :task_flow, only: [] do
    get '/', action: :index
    get :bootstrap
    post :bulk_create
  end
end
